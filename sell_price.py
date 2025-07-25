def minimal_loss(prices_list):
    min_loss=10000
    buys=-1
    sell=-1
    for i in range(len(prices_list)):
        for j in range(i+1,len(prices_list)):
            if prices_list[j]<prices_list[i]:
                loss=prices_list[j]-prices_list[i]
                if loss<min_loss:
                    min_loss=loss
                    buys=i+1
                    sell=j+1
    return  print(f"Buy in year {buys}, sell in year {sell}, loss = {min_loss}")


n=int(input("enter number of years: "))
prices_list=list(map(int,input().split()))

print(minimal_loss(prices_list))